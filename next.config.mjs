/** @type {import('next').NextConfig} */
const nextConfig = {
    /* config options here */
    images: {
        // 이미지 최적화 활성화 (성능 개선)
        formats: ["image/avif", "image/webp"],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    },
    // 압축 활성화
    compress: true,
    // 프로덕션에서 소스맵 비활성화 (보안 및 성능)
    productionBrowserSourceMaps: false,
    // 실험적 기능: 최적화된 패키지 임포트 -> 주석 처리
    // experimental: {
    //     optimizePackageImports: [
    //         "lucide-react",
    //         "@radix-ui/react-dropdown-menu",
    //         "@radix-ui/react-dialog",
    //         "@radix-ui/react-select",
    //     ],
    // },
    // Turbopack 설정 (개발 모드용) -> 제거
    turbopack: {},
    // 웹팩 최적화 (프로덕션 빌드용만, 개발 모드에서는 Turbopack 사용)
    webpack: (config, { dev, isServer }) => {
        // 개발 모드에서는 webpack 설정을 건너뛰고 Turbopack 사용
        if (dev) {
            return config;
        }

        // 프로덕션 빌드에서만 번들 최적화 적용
        if (!isServer) {
            config.optimization = {
                ...config.optimization,
                moduleIds: "deterministic",
                runtimeChunk: "single",
                splitChunks: {
                    chunks: "all",
                    cacheGroups: {
                        default: false,
                        vendors: false,
                        // 큰 라이브러리들을 별도 청크로 분리
                        vendor: {
                            name: "vendor",
                            chunks: "all",
                            test: /node_modules/,
                            priority: 20,
                        },
                        // Clerk를 별도 청크로 분리
                        clerk: {
                            name: "clerk",
                            chunks: "all",
                            test: /[\\/]node_modules[\\/]@clerk[\\/]/,
                            priority: 30,
                        },
                        // Radix UI를 별도 청크로 분리
                        radix: {
                            name: "radix",
                            chunks: "all",
                            test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
                            priority: 25,
                        },
                    },
                },
            };
        }
        return config;
    },
};

export default nextConfig;

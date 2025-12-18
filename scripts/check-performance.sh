#!/bin/bash

# 웹사이트 성능 체크 스크립트
# 사용법: ./scripts/check-performance.sh [URL]

URL=${1:-"http://localhost:3000"}

echo "🚀 웹사이트 성능 체크 시작..."
echo "대상 URL: $URL"
echo ""

# 1. 기본 응답 시간 측정
echo "📊 기본 응답 시간 측정 (5회 평균)"
total_time=0
for i in {1..5}; do
    response_time=$(curl -o /dev/null -s -w "%{time_total}" "$URL")
    total_time=$(echo "$total_time + $response_time" | bc)
    echo "  시도 $i: ${response_time}초"
    sleep 0.5
done
avg_time=$(echo "scale=3; $total_time / 5" | bc)
echo "  평균 응답 시간: ${avg_time}초"
echo ""

# 2. 상세 HTTP 정보
echo "📈 상세 HTTP 정보"
size_kb=$(curl -o /dev/null -s -w "%{size_download}" "$URL" | awk '{printf "%.2f", $1/1024}')
curl -o /dev/null -s -w "  HTTP 상태 코드: %{http_code}\n  다운로드 크기: %{size_download} bytes ($size_kb KB)\n  연결 시간: %{time_connect}초\n  첫 바이트까지: %{time_starttransfer}초\n  총 시간: %{time_total}초\n  다운로드 속도: %{speed_download} bytes/sec\n" "$URL"
echo ""

# 3. 헤더 정보
echo "🔍 주요 헤더 정보"
curl -I -s "$URL" | grep -E "(HTTP|Content-Type|Content-Length|Cache-Control|Server)" | sed 's/^/  /'
echo ""

# 4. Next.js 빌드 정보 확인
if [ -f ".next/BUILD_ID" ]; then
    echo "📦 빌드 정보"
    echo "  빌드 ID: $(cat .next/BUILD_ID)"
    if [ -f ".next/analyze/client.json" ] || [ -f ".next/analyze/server.json" ]; then
        echo "  번들 분석 파일이 있습니다."
    fi
    echo ""
fi

# 5. Lighthouse CLI 확인
if command -v lighthouse &> /dev/null; then
    echo "✅ Lighthouse CLI가 설치되어 있습니다."
    echo "   상세 분석을 원하시면 다음 명령어를 실행하세요:"
    echo "   lighthouse $URL --output=html --output-path=./lighthouse-report.html"
else
    echo "💡 Lighthouse CLI 설치 방법:"
    echo "   npm install -g @lhci/cli"
    echo "   또는"
    echo "   npm install -g lighthouse"
    echo ""
    echo "   설치 후 실행:"
    echo "   lighthouse $URL --output=html --output-path=./lighthouse-report.html"
fi

echo ""
echo "✅ 성능 체크 완료!"

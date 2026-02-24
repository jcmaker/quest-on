#!/bin/bash

# Gate System 마이그레이션 실행 스크립트
# 사용법: ./scripts/run-gate-migration.sh

set -e

echo "🚀 Gate System 마이그레이션 시작..."

# Prisma Client 재생성
echo "📦 Prisma Client 재생성 중..."
npx prisma generate

# 스키마 검증
echo "✅ Prisma 스키마 검증 중..."
npx prisma validate

echo ""
echo "✅ Prisma 스키마 준비 완료!"
echo ""
echo "⚠️  다음 단계:"
echo "1. Supabase Dashboard의 SQL Editor로 이동"
echo "2. prisma/migrations/add_gate_system_fields.sql 파일 내용을 복사"
echo "3. SQL Editor에서 실행"
echo ""
echo "또는 Supabase CLI를 사용하는 경우:"
echo "  supabase db push"
echo ""
echo "마이그레이션 완료 후 다음 명령어로 확인:"
echo "  npx prisma studio"
echo ""

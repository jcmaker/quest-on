-- 시험별 채점 가중치 설정: 채팅 단계(0-100), 답안 단계 = 100 - chat_weight
-- 기본값 50은 기존 동작(50:50 단순 평균)과 동일
ALTER TABLE exams ADD COLUMN chat_weight INT DEFAULT 50;

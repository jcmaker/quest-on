export const emoji3dCatalog = {
  "art-class": "/3d-emoji/Art Class.png",
  board: "/3d-emoji/Board.png",
  books: "/3d-emoji/Books.png",
  calculator: "/3d-emoji/Calculator.png",
  "chair-and-bag": "/3d-emoji/Chair and Bag .png",
  clipboard: "/3d-emoji/Clip Board.png",
  desktop: "/3d-emoji/Dekstop.png",
  "e-library": "/3d-emoji/E-Library.png",
  envelope: "/3d-emoji/Envelope.png",
  "exam-result": "/3d-emoji/Exam Result.png",
  "globe-book": "/3d-emoji/Globe Book.png",
  graduation: "/3d-emoji/Graduation.png",
  laptop: "/3d-emoji/Laptop.png",
  "online-class": "/3d-emoji/Online Class.png",
  "pencil-holder": "/3d-emoji/Pencil Holder.png",
  presentation: "/3d-emoji/Presentation.png",
  puzzle: "/3d-emoji/Puzzle.png",
  "question-and-answer": "/3d-emoji/Questiion And Answer.png",
  schedule: "/3d-emoji/Schedule.png",
  "school-building": "/3d-emoji/School Building.png",
  "school-equipment": "/3d-emoji/School Equipment.png",
  "science-lab": "/3d-emoji/Science Lab.png",
  science: "/3d-emoji/Science.png",
  "tie-watch": "/3d-emoji/Tie Watch.png",
  trophy: "/3d-emoji/Trophy.png",
} as const;

export type Emoji3dId = keyof typeof emoji3dCatalog;

export function getEmoji3dPath(id: Emoji3dId): (typeof emoji3dCatalog)[Emoji3dId] {
  return emoji3dCatalog[id];
}

export interface Emoji3dDecorativeItem {
  id: Emoji3dId;
  alt: string;
}

export const dashboardEmojiSets = {
  instructorHero: [
    { id: "presentation", alt: "강사용 프레젠테이션 이모티콘" },
    { id: "science-lab", alt: "과학 실험실 이모티콘" },
    { id: "school-equipment", alt: "교구 이모티콘" },
    { id: "books", alt: "교재 이모티콘" },
  ] as const satisfies readonly Emoji3dDecorativeItem[],
  studentHero: [
    { id: "graduation", alt: "졸업 모자 이모티콘" },
    { id: "online-class", alt: "온라인 클래스 이모티콘" },
    { id: "exam-result", alt: "시험 결과 이모티콘" },
    { id: "question-and-answer", alt: "질문 답변 이모티콘" },
  ] as const satisfies readonly Emoji3dDecorativeItem[],
  stats: [
    { id: "clipboard", alt: "클립보드 이모티콘" },
    { id: "trophy", alt: "트로피 이모티콘" },
    { id: "schedule", alt: "스케줄 이모티콘" },
  ] as const satisfies readonly Emoji3dDecorativeItem[],
} as const;

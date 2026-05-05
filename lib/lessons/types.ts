export interface Lesson {
  id: string;
  church_id: string;
  title: string;
  slug: string | null;
  body: string | null;
  video_url: string | null;
  order_index: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateLessonInput {
  church_id: string;
  title: string;
  slug?: string;
  body?: string;
  video_url?: string;
  order_index?: number;
  is_published?: boolean;
}

export interface UpdateLessonInput {
  title?: string;
  slug?: string;
  body?: string;
  video_url?: string;
  order_index?: number;
  is_published?: boolean;
}

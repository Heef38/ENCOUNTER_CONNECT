export interface Lesson {
  id: string;
  church_id: string;
  title: string;
  slug: string | null;
  body: string | null;
  video_url: string | null;
  order_index: number;
  is_published: boolean;
  /** What the lesson is for (migration 034). host_orientation gates hosting. */
  purpose: LessonPurpose;
  summary: string | null;
  minutes: number | null;
  /** Only this group's members (and staff) can read it. */
  audience_group_id: string | null;
  /** Shown in the Learn library, not only inside a journey step. */
  in_library: boolean;
  created_at: string;
  updated_at: string;
}

export type LessonPurpose = 'general' | 'host_orientation' | 'connector' | 'leader' | 'journey';

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

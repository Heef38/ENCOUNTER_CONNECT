import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, ExternalLink } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { getLibraryLesson } from '@/lib/learn/queries';
import { canHostEvents } from '@/lib/events/actions';
import { youTubeId } from '@/lib/learn/video';
import { SimpleText } from '@/components/content/simple-text';
import { Button } from '@/components/ui/button';
import { CompleteButton } from './complete-button';

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireAuth();
  const churchId = session.profile?.church_id;
  if (!churchId) notFound();
  const lesson = await getLibraryLesson(churchId, decodeURIComponent(slug), session.id);
  if (!lesson) notFound();
  const video = youTubeId(lesson.video_url);
  const isOrientation = lesson.purpose === 'host_orientation';
  const canHost = isOrientation && lesson.completed_at ? await canHostEvents() : false;

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <Link href="/learn" className="text-sm text-foreground-muted hover:text-primary">
        ← Learn
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{lesson.title}</h1>
        {lesson.minutes && (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-foreground-muted">
            <Clock className="h-4 w-4" />
            {lesson.minutes} minutes
          </p>
        )}
      </header>

      {video ? (
        <div className="aspect-video overflow-hidden rounded-lg border border-border">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video}`}
            title={lesson.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : lesson.video_url ? (
        <a href={lesson.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ExternalLink className="h-4 w-4" />
          Watch the video
        </a>
      ) : null}

      {lesson.body && <SimpleText text={lesson.body} className="text-base leading-relaxed text-foreground" />}

      <div className="space-y-3 border-t border-border pt-5">
        <CompleteButton lessonId={lesson.id} done={Boolean(lesson.completed_at)} unlocksHosting={isOrientation} />
        {isOrientation && lesson.completed_at && (
          canHost ? (
            <Link href="/hub/new">
              <Button variant="outline">Host a gathering</Button>
            </Link>
          ) : (
            <p className="text-sm text-foreground-muted">
              Thanks. Hosting opens up once you&apos;ve also had your first meeting with your connector.
            </p>
          )
        )}
      </div>
    </article>
  );
}

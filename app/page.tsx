import GameView from '@/components/shared/GameView';
import UpdateBanner from '@/components/shared/UpdateBanner';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rivalParam = typeof params.rival === 'string' ? params.rival : undefined;

  return (
    <main
      className="flex h-dvh w-screen flex-col overflow-hidden"
      style={{ backgroundColor: '#0b0a0f' }}
    >
      <UpdateBanner />
      <GameView rivalEncoded={rivalParam} />
    </main>
  );
}

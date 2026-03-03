import GameView from '@/components/shared/GameView';
import UpdateBanner from '@/components/shared/UpdateBanner';

export default function Home() {
  return (
    <main
      className="flex h-dvh w-screen flex-col overflow-hidden"
      style={{ backgroundColor: '#0a0e1a' }}
    >
      <UpdateBanner />
      <GameView />
    </main>
  );
}

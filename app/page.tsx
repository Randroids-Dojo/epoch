import GameView from '@/components/shared/GameView';
import UpdateBanner from '@/components/shared/UpdateBanner';

export default function Home() {
  return (
    <main
      className="flex h-dvh w-screen flex-col overflow-hidden"
      style={{ backgroundColor: '#0b0a0f' }}
    >
      <UpdateBanner />
      <GameView />
    </main>
  );
}

import GameView from '@/components/shared/GameView';

export default function Home() {
  return (
    <main
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ backgroundColor: '#0a0e1a' }}
    >
      <GameView />
    </main>
  );
}

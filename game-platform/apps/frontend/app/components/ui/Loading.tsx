// Full-page wait state: a single card flipping in place
export default function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status">
      <div className="card-back h-16 w-12 animate-[spin-y_1.2s_ease-in-out_infinite] rounded-lg" />
      <p className="text-sm text-chalk">{label}</p>
      <style>{`@keyframes spin-y { 0%, 100% { transform: rotateY(0) } 50% { transform: rotateY(180deg) } }`}</style>
    </div>
  );
}

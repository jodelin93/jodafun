export default function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading the profile">
      <div className="h-9 w-48 rounded bg-white/10" />
      <div className="mt-3 h-5 w-40 rounded bg-white/10" />
      <div className="panel mt-8 h-24" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="panel h-24" />
        <div className="panel h-24" />
        <div className="panel h-24" />
      </div>
    </div>
  );
}

import { Suspense } from 'react';
import JodaMemory from '../../components/JodaMemory';

export default function JodaMemoryPage() {
  // JodaMemory reads useSearchParams(), which needs a Suspense boundary for static prerendering
  return (
    <Suspense>
      <JodaMemory />
    </Suspense>
  );
}

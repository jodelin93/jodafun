import { Suspense } from 'react';
import FiveInARow from '../../components/five/FiveInARow';

export default function FiveInARowPage() {
  // The game reads useSearchParams(), which needs a Suspense boundary for static prerendering
  return (
    <Suspense>
      <FiveInARow />
    </Suspense>
  );
}

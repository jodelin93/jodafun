import { Suspense } from 'react';
import Draughts from '../../components/draughts/Draughts';

export default function DraughtsPage() {
  // Draughts reads useSearchParams(), which needs a Suspense boundary for static prerendering
  return (
    <Suspense>
      <Draughts />
    </Suspense>
  );
}

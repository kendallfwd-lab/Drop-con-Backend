import { useCallback } from 'react';

export default function usePageScroller() {
  return useCallback((element) => element?.scrollIntoView({ behavior: 'smooth', block: 'start' }), []);
}

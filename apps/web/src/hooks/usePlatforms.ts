import { useState, useEffect } from 'react';

export function usePlatforms(taskType: string) {
  const [platforms, setPlatforms] = useState([]);

  useEffect(() => {
    fetch(`/api/platforms?taskType=${taskType}`)
      .then(r => r.json())
      .then(setPlatforms);
  }, [taskType]);

  return platforms;
}

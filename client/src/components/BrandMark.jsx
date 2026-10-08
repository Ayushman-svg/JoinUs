import { Video } from 'lucide-react';

export default function BrandMark({ inverse = false }) {
  return (
    <span className={`brand-mark ${inverse ? 'brand-mark--inverse' : ''}`.trim()}>
      <span className="brand-mark__icon" aria-hidden="true">
        <Video size={20} />
      </span>
      JoinUs
    </span>
  );
}

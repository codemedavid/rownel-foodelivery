import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePromotions } from '../../hooks/usePromotions';
import OptimizedImage from '../OptimizedImage';

const BANNER_WIDTH = 900;
const AUTO_ADVANCE_MS = 5000;

const PromoCarousel: React.FC = () => {
  const navigate = useNavigate();
  const { promotions } = usePromotions();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (promotions.length <= 1) return;
    const id = window.setInterval(() => setIndex((prev) => (prev + 1) % promotions.length), AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [promotions.length]);

  useEffect(() => {
    if (index >= promotions.length) setIndex(0);
  }, [index, promotions.length]);

  if (promotions.length === 0) return null;

  const openLink = (link: string | null) => {
    if (!link) return;
    if (/^https?:\/\//.test(link)) {
      window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(link);
  };

  return (
    <section aria-label="Promotions">
      <div className="relative h-40 overflow-hidden rounded-2xl shadow-sm">
        {promotions.map((promotion, i) => (
          <button
            type="button"
            key={promotion.id}
            onClick={() => openLink(promotion.cta_link)}
            className={`absolute inset-0 text-left text-white transition-opacity duration-500 ${
              i === index ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'
            }`}
          >
            {promotion.banner_image_url ? (
              <OptimizedImage
                src={promotion.banner_image_url}
                alt={promotion.title}
                width={BANNER_WIDTH}
                isPriority={i === 0}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-brand-700 to-brand-500" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
            <div className="relative z-10 flex h-full flex-col justify-end p-5">
              <h3 className="text-xl font-bold leading-tight">{promotion.title}</h3>
              {promotion.subtitle && <p className="mt-0.5 text-xs opacity-90">{promotion.subtitle}</p>}
              {promotion.cta_text && (
                <span className="mt-2 inline-block self-start rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-700">
                  {promotion.cta_text}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      {promotions.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {promotions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Go to promotion ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-brand-600' : 'w-1.5 bg-gray-300'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default PromoCarousel;

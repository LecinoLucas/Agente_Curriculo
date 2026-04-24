export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, columns = 3 }: { count?: number; columns?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card-item">
          <div className="skeleton-line" style={{ width: "55%", height: 12 }} />
          <div className="skeleton-line" style={{ width: "35%", height: 32, marginTop: 14 }} />
        </div>
      ))}
    </div>
  );
}

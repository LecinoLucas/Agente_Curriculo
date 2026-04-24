import { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  title: string;
  description?: string;
}>;

export function Card({ title, description, children }: CardProps) {
  return (
    <section className="card">
      <div className="card-header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

import Link from 'next/link';

type Action = {
  href: string;
  label: string;
};

export default function PageIntro({
  title,
  description,
  actions = [],
}: {
  title: string;
  description: string;
  actions?: Action[];
}) {
  return (
    <section className="journal-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '16px',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div className="page-header">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        {actions.length ? (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {actions.map((action) => (
              <Link key={action.href} href={action.href} className="btn-secondary">
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

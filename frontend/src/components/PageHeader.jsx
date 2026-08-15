export default function PageHeader({ title, subtitle }) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{subtitle}</p>
    </>
  );
}

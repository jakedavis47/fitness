export default function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur">
      <h1 className="text-lg font-semibold">{title}</h1>
      {action}
    </header>
  )
}

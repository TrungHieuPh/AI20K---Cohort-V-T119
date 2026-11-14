// A template remounts on every move between the app's pages, so each page fades in
// while the dock and the results tabs (in the layout) stay put.
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 animate-in flex-col duration-300 fade-in-0 motion-reduce:animate-none">
      {children}
    </div>
  )
}

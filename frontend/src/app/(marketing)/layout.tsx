export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div id="content" className="min-h-full overflow-x-hidden bg-canvas text-text">
      {children}
    </div>
  );
}

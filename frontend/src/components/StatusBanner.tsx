interface StatusBannerProps {
  tone: 'error' | 'success' | 'info';
  children: string;
}

export function StatusBanner({ tone, children }: StatusBannerProps) {
  return (
    <p className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

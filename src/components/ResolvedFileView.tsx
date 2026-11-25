import React from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useResolvedFileUrl } from '../lib/chunkedUpload';

interface ResolvedFileLinkProps {
  url: string;
  fileName?: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

export const ResolvedFileLink: React.FC<ResolvedFileLinkProps> = ({
  url,
  fileName,
  className,
  onClick,
  children,
}) => {
  const { resolvedUrl, resolving } = useResolvedFileUrl(url);

  if (resolving) {
    return (
      <span className={className}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Loading file...</span>
      </span>
    );
  }

  if (!resolvedUrl) return null;

  return (
    <a
      href={resolvedUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={resolvedUrl.startsWith('blob:') ? fileName || 'academy-file' : undefined}
      onClick={onClick}
      className={className}
    >
      {children}
    </a>
  );
};

interface ResolvedImageProps {
  url: string;
  alt: string;
  className?: string;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
}

export const ResolvedImage: React.FC<ResolvedImageProps> = ({
  url,
  alt,
  className,
  referrerPolicy,
}) => {
  const { resolvedUrl, resolving } = useResolvedFileUrl(url);

  if (resolving) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border-theme bg-surface-subtle p-6 text-xs text-muted gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-accent-sky" />
        <span>Loading photo...</span>
      </div>
    );
  }

  if (!resolvedUrl) return null;

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      referrerPolicy={referrerPolicy}
      className={className}
    />
  );
};

export const ResolvedExternalIcon: React.FC = () => <ExternalLink className="h-3 w-3" />;

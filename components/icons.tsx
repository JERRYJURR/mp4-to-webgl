import type { SVGProps } from "react";

const stroke: Pick<SVGProps<SVGSVGElement>, "fill" | "strokeWidth" | "strokeLinecap" | "strokeLinejoin"> = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...stroke} {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...stroke} {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...stroke} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...stroke} {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function EllipsisIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...stroke} {...props}>
      <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z" />
      <path d="M6 12h16" />
    </svg>
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...stroke} {...props}>
      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
    </svg>
  );
}

export function IterationsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...stroke} {...props}>
      <path d="m16 14 4 4-4 4" />
      <path d="M20 10a8 8 0 1 0-8 8h8" />
    </svg>
  );
}

export function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      {...props}
    >
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  );
}

export function SpinnerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" {...stroke} {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function FileVideoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d="M7 3.5C6.602 3.5 6.221 3.658 5.939 3.939C5.658 4.221 5.5 4.602 5.5 5V19C5.5 19.398 5.658 19.779 5.939 20.061C6.221 20.342 6.602 20.5 7 20.5H17C17.398 20.5 17.779 20.342 18.061 20.061C18.342 19.779 18.5 19.398 18.5 19V9.414C18.5 9.282 18.447 9.154 18.354 9.061L12.939 3.647C12.846 3.553 12.719 3.5 12.586 3.5H7ZM5.232 3.232C5.701 2.763 6.337 2.5 7 2.5H12.586C12.984 2.5 13.365 2.658 13.647 2.939L19.061 8.353C19.342 8.635 19.5 9.016 19.5 9.414V19C19.5 19.663 19.237 20.299 18.768 20.768C18.299 21.237 17.663 21.5 17 21.5H7C6.337 21.5 5.701 21.237 5.232 20.768C4.763 20.299 4.5 19.663 4.5 19V5C4.5 4.337 4.763 3.701 5.232 3.232" />
      <path fillRule="evenodd" clipRule="evenodd" d="M7.472 9.972C7.774 9.67 8.184 9.5 8.611 9.5H12.389C12.816 9.5 13.226 9.67 13.528 9.972C13.83 10.274 14 10.684 14 11.111V11.357L15.447 10.524C15.633 10.43 15.812 10.392 15.992 10.4C16.172 10.408 16.346 10.462 16.499 10.557C16.652 10.651 16.779 10.783 16.866 10.94C16.954 11.098 17 11.274 17 11.454V15.212C17 15.392 16.954 15.569 16.866 15.726C16.779 15.883 16.652 16.015 16.499 16.11C16.346 16.204 16.172 16.258 15.992 16.266C15.812 16.274 15.633 16.237 15.473 16.156L14 15.309V15.556C14 15.983 13.83 16.393 13.528 16.695C13.226 16.997 12.816 17.167 12.389 17.167H8.611C8.184 17.167 7.774 16.997 7.472 16.695C7.17 16.393 7 15.983 7 15.556V11.111C7 10.684 7.17 10.274 7.472 9.972ZM14 14.155L15.926 15.264C15.94 15.268 15.956 15.267 15.974 15.259C15.988 15.247 16 15.227 16 15.212V11.455C16 11.443 15.988 11.422 15.974 11.408C15.956 11.4 15.94 11.4 15.926 11.402L14 12.511V14.155ZM13 11.111C13 10.949 12.936 10.794 12.821 10.679C12.706 10.564 12.551 10.5 12.389 10.5H8.611C8.449 10.5 8.294 10.564 8.179 10.679C8.064 10.794 8 10.949 8 11.111V15.556C8 15.718 8.064 15.873 8.179 15.988C8.294 16.102 8.449 16.167 8.611 16.167H12.389C12.551 16.167 12.706 16.102 12.821 15.988C12.936 15.873 13 15.718 13 15.556V11.111Z" />
    </svg>
  );
}

import { GithubIcon } from "./icons";

export function Header() {
  return (
    <header className="flex w-full items-center justify-center py-8 px-16">
      <a
        href="https://github.com/JERRYJURR/mp4-to-webgl"
        target="_blank"
        rel="noreferrer"
        className="flex items-center px-3 rounded-full h-11 gap-2 shrink-0 outline outline-1 -outline-offset-1 outline-white/10 hover:bg-white/[0.04] transition"
      >
        <GithubIcon className="w-6 h-6 text-[#FAFAFA]" />
        <span className="text-base/5 text-[#FAFAFA]">mp4-to-webgl</span>
      </a>
    </header>
  );
}

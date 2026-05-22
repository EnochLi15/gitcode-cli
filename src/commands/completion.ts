export async function completionCommand(args: string[], commandNames: Set<string>): Promise<void> {
  const shell = args.shift() ?? "bash";
  const words = [...commandNames].sort().join(" ");
  if (shell === "zsh") {
    console.log(`#compdef gc gitcode\n_arguments '1: :(${words})'`);
    return;
  }
  if (shell === "fish") {
    console.log(`complete -c gc -f -a "${words}"\ncomplete -c gitcode -f -a "${words}"`);
    return;
  }
  if (shell === "bash") {
    console.log(`_gc_completion() { COMPREPLY=( $(compgen -W "${words}" -- "\${COMP_WORDS[COMP_CWORD]}") ); }\ncomplete -F _gc_completion gc gitcode`);
    return;
  }
  throw new Error("Usage: gc completion [bash|zsh|fish]");
}

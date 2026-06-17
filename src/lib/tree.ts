export interface FileNode {
  name: string;
  path: string; // relative path from folder root
  kind: "file" | "dir";
  children?: FileNode[];
}

export function buildTree(relPaths: string[]): FileNode[] {
  const rootChildren: FileNode[] = [];
  for (const rel of relPaths) {
    const parts = rel.split("/");
    let level = rootChildren;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      let next = level.find((c) => c.name === part);
      if (!next) {
        next = {
          name: part,
          path,
          kind: isFile ? "file" : "dir",
          children: isFile ? undefined : [],
        };
        level.push(next);
      }
      if (!isFile) {
        next.children ??= [];
        level = next.children;
      }
    });
  }
  sortNodes(rootChildren);
  return rootChildren;
}

function sortNodes(nodes: FileNode[]): void {
  nodes.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name),
  );
  for (const n of nodes) if (n.children) sortNodes(n.children);
}

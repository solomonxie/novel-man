import type { Entity, Relation } from '../db/repo';

export type Node = { id: string; name: string; x: number; y: number; degree: number };
export type Edge = { from: Node; to: Node; label: string };

/**
 * A ring, ordered by how connected each character is. Force layouts look
 * better on paper and worse on a phone: they drift, they overlap, and they
 * make the same book look different every time it is opened.
 */
export function layoutGraph(
  entities: Entity[],
  relations: Relation[],
  size: number
): { nodes: Node[]; edges: Edge[] } {
  const degree = new Map<string, number>();
  for (const relation of relations) {
    degree.set(relation.from_id, (degree.get(relation.from_id) ?? 0) + 1);
    degree.set(relation.to_id, (degree.get(relation.to_id) ?? 0) + 1);
  }

  const connected = entities
    .filter((entity) => degree.has(entity.id))
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));

  const radius = size / 2 - 44;
  const center = size / 2;
  const nodes: Node[] = connected.map((entity, index) => {
    const angle = (index / Math.max(1, connected.length)) * Math.PI * 2 - Math.PI / 2;
    return {
      id: entity.id,
      name: entity.name,
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
      degree: degree.get(entity.id) ?? 0,
    };
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: Edge[] = [];
  for (const relation of relations) {
    const from = byId.get(relation.from_id);
    const to = byId.get(relation.to_id);
    if (from && to) edges.push({ from, to, label: relation.label });
  }
  return { nodes, edges };
}

/**
 * Everyone you can get to from one person by following relations, however
 * many steps it takes — the component they belong to. A graph of a long novel
 * is several unconnected crowds drawn on top of each other; picking a person
 * and seeing only the crowd they are actually part of is the one question a
 * ring of forty names cannot answer by itself.
 *
 * Direction is ignored: "X is Y's father" connects them both ways round.
 */
export function reachable(from: string, relations: Relation[]): Set<string> {
  const neighbours = new Map<string, string[]>();
  const link = (one: string, other: string) => {
    const known = neighbours.get(one);
    if (known) known.push(other);
    else neighbours.set(one, [other]);
  };
  for (const relation of relations) {
    link(relation.from_id, relation.to_id);
    link(relation.to_id, relation.from_id);
  }

  const found = new Set([from]);
  const queue = [from];
  while (queue.length) {
    for (const next of neighbours.get(queue.pop()!) ?? []) {
      if (found.has(next)) continue;
      found.add(next);
      queue.push(next);
    }
  }
  return found;
}

/** A relation belongs to the chapters both characters were in together. */
export function withinRange(relation: Relation, from: number, to: number): boolean {
  return relation.last_chapter >= from && relation.first_chapter <= to;
}

export function edgeGeometry(edge: Edge) {
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  return {
    left: edge.from.x,
    top: edge.from.y,
    width: Math.hypot(dx, dy),
    angle: `${Math.atan2(dy, dx)}rad`,
  };
}

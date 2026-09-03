import type { CategoryRecord } from "../types";

export type CategoryNode = CategoryRecord & {
  children: CategoryNode[];
  depth: number;
};

export type FlatCategory = CategoryRecord & {
  depth: number;
  path: string[];
};

const LOWERCASE_WORDS = new Set(["and", "or", "with", "for", "of", "the", "a", "an"]);

function fallbackSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "category";
}

export function displayCategoryName(name: string) {
  const value = name.trim();
  if (!value || /[a-z]/.test(value)) return value;
  return value
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\b[\w&*]+\b/g, (word, offset) => {
      if (offset > 0 && LOWERCASE_WORDS.has(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    });
}

export function displayCategoryPath(path: string[]) {
  return path.map(displayCategoryName).join(" > ");
}

export function categoryDisplayRecords(records?: CategoryRecord[], fallbackNames: string[] = []): CategoryRecord[] {
  const activeRecords = (records || []).filter((category) => category.active && !category.archived);
  if (activeRecords.length) return activeRecords;
  return fallbackNames.map((name, index) => ({
    name,
    slug: fallbackSlug(name),
    description: "",
    image: "",
    parent_slug: null,
    display_order: index + 1,
    active: true,
    archived: false,
    seo_title: "",
    seo_description: "",
    product_count: 0,
  }));
}

export function buildCategoryTree(records: CategoryRecord[]): CategoryNode[] {
  const sorted = [...records].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
  const nodes = new Map<string, CategoryNode>();
  sorted.forEach((record) => {
    nodes.set(record.slug, { ...record, parent_slug: record.parent_slug || null, children: [], depth: 0 });
  });

  const roots: CategoryNode[] = [];
  nodes.forEach((node) => {
    const parent = node.parent_slug ? nodes.get(node.parent_slug) : undefined;
    if (parent && parent.slug !== node.slug) parent.children.push(node);
    else roots.push(node);
  });

  const assignDepth = (children: CategoryNode[], depth: number) => {
    children.forEach((child) => {
      child.depth = depth;
      assignDepth(child.children, depth + 1);
    });
  };
  assignDepth(roots, 0);
  return roots;
}

export function flattenCategoryTree(nodes: CategoryNode[], path: string[] = []): FlatCategory[] {
  return nodes.flatMap((node) => {
    const currentPath = [...path, node.name];
    const { children, depth, ...category } = node;
    return [{ ...category, depth, path: currentPath }, ...flattenCategoryTree(children, currentPath)];
  });
}

export function categoryPathLabel(category: Pick<CategoryRecord, "name" | "parent_slug" | "slug">, records: CategoryRecord[]) {
  const bySlug = new Map(records.map((record) => [record.slug, record]));
  const path = [category.name];
  const seen = new Set<string>([category.slug]);
  let parentSlug = category.parent_slug || null;
  while (parentSlug) {
    const parent = bySlug.get(parentSlug);
    if (!parent || seen.has(parent.slug)) break;
    path.unshift(parent.name);
    seen.add(parent.slug);
    parentSlug = parent.parent_slug || null;
  }
  return path.join(" > ");
}

export function categoryNameSetWithDescendants(name: string, records: CategoryRecord[]) {
  const match = records.find((record) => record.name === name);
  if (!match) return new Set([name]);

  const byParent = new Map<string | null, CategoryRecord[]>();
  records.forEach((record) => {
    const parentSlug = record.parent_slug || null;
    byParent.set(parentSlug, [...(byParent.get(parentSlug) || []), record]);
  });

  const names = new Set<string>();
  const seen = new Set<string>();
  const stack = [match];
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current.slug)) continue;
    seen.add(current.slug);
    names.add(current.name);
    stack.push(...(byParent.get(current.slug) || []));
  }
  return names;
}

export function isCategoryDescendant(parentSlug: string, childSlug: string, records: CategoryRecord[]) {
  const bySlug = new Map(records.map((record) => [record.slug, record]));
  let current = bySlug.get(childSlug);
  const seen = new Set<string>();
  while (current?.parent_slug) {
    if (current.parent_slug === parentSlug) return true;
    if (seen.has(current.parent_slug)) return false;
    seen.add(current.parent_slug);
    current = bySlug.get(current.parent_slug);
  }
  return false;
}

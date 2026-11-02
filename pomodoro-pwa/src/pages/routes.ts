export const ROUTES = {
  foco: { hash: '#foco', title: 'Foco' },
  plano: { hash: '#plano', title: 'Plano de estudos' },
  progresso: { hash: '#progresso', title: 'Progresso' },
  ambientes: { hash: '#ambientes', title: 'Ambientes' },
} as const;

export type PageRoute = keyof typeof ROUTES;

const ROUTE_BY_HASH = new Map<string, PageRoute>(
  Object.entries(ROUTES).map(([key, route]) => [route.hash, key as PageRoute]),
);

export function resolveRoute(hash: string): PageRoute {
  return ROUTE_BY_HASH.get(hash) ?? 'foco';
}

export function getPageTitle(route: PageRoute): string {
  return ROUTES[route].title;
}

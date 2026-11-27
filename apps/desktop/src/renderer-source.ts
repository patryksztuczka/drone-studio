import { Option, Schema } from "effect";

export const RendererSource = Schema.TaggedUnion({
  DevServer: { url: Schema.URL },
  Bundle: { directory: Schema.String, origin: Schema.URL },
});

export type RendererSource = typeof RendererSource.Type;

export type Bundle = typeof RendererSource.cases.Bundle.Type;

export const Resolution = Schema.TaggedUnion({
  File: { directory: Schema.String, relativePath: Schema.String },
  NotFound: {},
  Network: {},
});

export type Resolution = typeof Resolution.Type;

export const BUNDLE_ORIGIN = new URL("https://studio.invalid");

const decodePathname = Schema.decodeOption(Schema.StringFromUriComponent);

const isUnsafeSegment = (segment: string) =>
  segment === "." || segment === ".." || segment.includes("\u0000");

const isSameOrigin = (left: URL, right: URL) =>
  left.protocol === right.protocol && left.host === right.host;

export const appUrl = (source: RendererSource): URL =>
  RendererSource.match(source, {
    DevServer: (devServer) => devServer.url,
    Bundle: (bundle) => new URL("/", bundle.origin),
  });

const bundleFile = (directory: string, pathname: string): Resolution =>
  Option.match(decodePathname(pathname), {
    onNone: () => Resolution.cases.NotFound.make({}),
    onSome: (decoded) => {
      const segments = decoded.split(/[/\\]/).filter((segment) => segment !== "");

      if (segments.some(isUnsafeSegment)) return Resolution.cases.NotFound.make({});

      const last = segments.at(-1);

      return Resolution.cases.File.make({
        directory,
        relativePath: last === undefined || !last.includes(".") ? "index.html" : segments.join("/"),
      });
    },
  });

export const resolveBundleRequest = (bundle: Bundle, requested: URL): Resolution => {
  if (!isSameOrigin(requested, bundle.origin)) return Resolution.cases.Network.make({});

  return bundleFile(bundle.directory, requested.pathname);
};

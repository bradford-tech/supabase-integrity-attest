export function Diagram({ name, alt }: { name: string; alt: string }) {
  return (
    <figure className="not-prose my-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/diagrams/${name}-light.svg`}
        alt={alt}
        className="w-full dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/diagrams/${name}-dark.svg`}
        alt={alt}
        className="hidden w-full dark:block"
      />
    </figure>
  )
}

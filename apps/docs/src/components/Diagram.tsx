export function Diagram({
  name,
  alt,
  width,
  height,
}: {
  name: string
  alt: string
  width: number
  height: number
}) {
  return (
    <figure className="not-prose my-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/diagrams/${name}-light.svg`}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/diagrams/${name}-dark.svg`}
        alt={alt}
        width={width}
        height={height}
        className="hidden h-auto w-full dark:block"
      />
    </figure>
  )
}

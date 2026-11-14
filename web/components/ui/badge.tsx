import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // Verdicts. Colour is never the only signal: VerdictBadge always adds an icon and a word.
        correct:
          "border-verdict-correct/25 bg-verdict-correct-soft text-verdict-correct",
        wrong:
          "border-verdict-wrong/25 bg-verdict-wrong-soft text-verdict-wrong",
        ungrounded:
          "border-verdict-ungrounded/25 bg-verdict-ungrounded-soft text-verdict-ungrounded",
        error:
          "border-verdict-error/25 bg-verdict-error-soft text-verdict-error",
        // A neutral note next to an item, e.g. "câu trả lời trích" on a retrieved article.
        accent: "border-primary/20 bg-secondary text-secondary-foreground",
      },
      size: {
        default: "",
        // A headline verdict, e.g. the release gate.
        lg: "h-8 gap-1.5 px-3 text-sm has-data-[icon=inline-start]:pl-2.5 [&>svg]:size-4!",
      },
      // The landing's navy: a tinted label rather than a light sticker, colours below.
      surface: {
        light: "",
        dark: "rounded-md font-semibold",
      },
    },
    compoundVariants: [
      {
        surface: "dark",
        variant: "correct",
        className:
          "border-hero-correct/35 bg-hero-correct/14 text-hero-correct",
      },
      {
        surface: "dark",
        variant: "wrong",
        className: "border-hero-wrong/35 bg-hero-wrong/14 text-hero-wrong",
      },
      {
        surface: "dark",
        variant: "ungrounded",
        className:
          "border-hero-ungrounded/35 bg-hero-ungrounded/14 text-hero-ungrounded",
      },
      {
        // --hero-error is too dim for text on navy; the word stays in the muted ink.
        surface: "dark",
        variant: "error",
        className: "border-hero-error/50 bg-hero-error/14 text-hero-muted",
      },
      {
        surface: "dark",
        variant: "accent",
        className: "border-hero-accent/35 bg-hero-accent/10 text-hero-accent",
      },
      {
        surface: "dark",
        size: "default",
        className:
          "h-6 px-2 text-[0.8rem] has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3.5!",
      },
      {
        surface: "dark",
        size: "lg",
        className:
          "h-9 gap-2 px-3.5 text-base has-data-[icon=inline-start]:pl-3 [&>svg]:size-[1.1rem]!",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      surface: "light",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  surface = "light",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size, surface }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }

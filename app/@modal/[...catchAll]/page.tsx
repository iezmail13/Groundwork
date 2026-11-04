/**
 * Any other navigation closes the modal: a slot keeps showing what it last
 * matched until something new matches it, so every route matches nothing here
 * (D117). The home page is covered by default.tsx, since the modal always
 * closes by going back rather than by a link to "/".
 */
export default function NoModal() {
  return null;
}

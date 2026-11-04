/**
 * Any other navigation, the home page included, closes the modal: a slot keeps
 * showing what it last matched until something new matches it, so every route
 * matches nothing here (D117). (A separate @modal/page.tsx for "/" made the
 * development server reload the home page in a loop.)
 */
export default function NoModal() {
  return null;
}

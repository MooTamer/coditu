/**
 * Nothing to show in the modal slot on a normal render. Without this file Next
 * 404s the whole route on a hard refresh while the slot has no match.
 */
export default function ModalDefault() {
  return null;
}

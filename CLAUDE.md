# ListsManager — project notes

---

# Finish the feature from the user's chair — one build, not five

A feature is not done when the happy path works. It is done when a first-time user can complete the whole job without hitting a dead end. Half-built features cost the user multiple build-and-deploy cycles to get right — avoid that by walking the feature as a user **before** writing code, and again before reporting it done.

## Before coding: list every user-facing site
1. **Every place the thing appears or is chosen** — add form, edit dialog, bulk/paste paths, settings, filters, empty states, the "done"/archived views. If a dropdown, colour, label or option is added in one, it must appear in all of them (the edit-dialog vs add-form category gap happened exactly this way).
2. **The default state.** What does a brand-new user, a brand-new list, or an empty collection see? A control hidden until "set up" is a dead end — show it by default and let it be optional.
3. **The full lifecycle.** Create, see, use, change, reorder, rename, remove, undo. If you built "create", ask what "rename" and "remove" do and whether removing orphans data.
4. **The natural gesture.** If a user would expect to drag it, multi-select it, paste many, or tap it on a phone — support that, or say plainly that it isn't supported.
5. **Empty and zero states.** An empty category/section that is invisible cannot be dropped into or discovered.
6. **Offline and mobile.** Same behaviour with a thumb and without a network, or an explicit note of the gap.

## Before reporting done
- State, in the summary, the walk-through you did ("add X → see it → move it → rename → remove") and any user-facing gap you knowingly left, **with a recommendation** — never leave a half-built path silent.
- Prefer one complete pass over several incremental ones. If scope is large, say so up front and propose the full list, rather than shipping a slice and waiting to be told what's missing.
- The user's repeated feedback: *"you seem to be doing the bare minimum and not thinking like a user."* Treat that as the standing review criterion.

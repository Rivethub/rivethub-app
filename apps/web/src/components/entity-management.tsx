import type { EntityCategory, EntitySummary } from "@rivethub/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useClient } from "../client/context";
import { useCreateEntity, useCreateEntityCategory } from "../client/queries";
import { useIsPhone } from "../lib/media";
import { useEntityDrag } from "./entity-drag";
import { Modal } from "./modal";
import { Button, cx } from "./ui";

const field = "min-h-10 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-foreground outline-none focus:border-primary";

function CategorySelect({ categories, value, onChange }: {
  categories: EntityCategory[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      Category
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="" disabled>Choose a category</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.typeName}</option>)}
      </select>
    </label>
  );
}

type CreateKind = "category" | "entity";

export function NewEntityActions({ categories, selected }: { categories: EntityCategory[] | null | undefined; selected: string }) {
  const client = useClient();
  const drag = useEntityDrag();
  const phone = useIsPhone();
  const [open, setOpen] = useState<CreateKind | null>(null);
  if (!categories || (!client.createEntityCategory && !client.createEntity)) return null;
  const buttonClass = cx(phone && "min-h-11");
  return (
    <div className="flex flex-wrap gap-2">
      {client.createEntityCategory && <Button size="md" className={buttonClass} disabled={drag.pending} onClick={() => setOpen("category")}>New category</Button>}
      {client.createEntity && (
        <Button size="md" className={buttonClass} disabled={drag.pending || !categories.length} onClick={() => setOpen("entity")}>New entity</Button>
      )}
      {open && <CreateDialog kind={open} categories={categories} selected={selected} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CreateDialog({ kind, categories, selected, onClose }: { kind: CreateKind; categories: EntityCategory[]; selected: string; onClose: () => void }) {
  const createEntity = useCreateEntity();
  const createCategory = useCreateEntityCategory();
  const navigate = useNavigate();
  const isEntity = kind === "entity";
  const write = isEntity ? createEntity : createCategory;
  const title = isEntity ? "New entity" : "New category";
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>(() => categories.find(({ type }) => type === selected)?.id ?? "");
  const category = categories.find(({ id }) => id === categoryId);
  return (
    <Modal label={title} onClose={() => { if (!write.isPending) onClose(); }}>
      <form className="flex flex-col gap-3 p-4" onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || write.isPending) return;
        if (isEntity) {
          if (!category) return;
          createEntity.mutate({ name: trimmed, categoryId: category.id }, {
            onSuccess: (id) => {
              onClose();
              void navigate({ to: "/entities/$entityId", params: { entityId: id } });
            },
          });
        } else {
          createCategory.mutate(trimmed, { onSuccess: onClose });
        }
      }}>
        <h2 className="m-0 text-[16px] font-semibold">{title}</h2>
        <fieldset disabled={write.isPending} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
          <label className="flex flex-col gap-1 text-[13px]">
            {isEntity ? "Entity name" : "Category name"}
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          {isEntity && <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />}
        </fieldset>
        {write.isError && <p role="alert" className="m-0 text-[13px] text-error">{write.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button size="md" className="min-h-10" disabled={write.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" size="md" variant="primary" className="min-h-10" disabled={write.isPending || !name.trim() || (isEntity && !category)}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ChangeEntityCategory({ entity, categories }: { entity: EntitySummary; categories: EntityCategory[] | null | undefined }) {
  const client = useClient();
  const drag = useEntityDrag();
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const destinations = categories?.filter(({ type }) => type !== entity.type) ?? [];
  if (!client.moveEntity || destinations.length === 0) return null;
  const destination = destinations.find(({ id }) => id === selected);
  return (
    <>
      <Button size="md" className={cx("self-start", phone && "min-h-11")} disabled={drag.pending} onClick={() => { setSelected(""); setOpen(true); }}>Change category…</Button>
      {open && (
        <Modal label="Change category" onClose={() => setOpen(false)}>
          <form className="flex flex-col gap-3 p-4" onSubmit={(e) => {
            e.preventDefault();
            if (!destination) return;
            drag.move(entity, destination);
            setOpen(false);
          }}>
            <h2 className="m-0 text-[16px] font-semibold">Change category for {entity.title}</h2>
            <CategorySelect categories={destinations} value={selected} onChange={setSelected} />
            <div className="flex justify-end gap-2">
              <Button size="md" className="min-h-10" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="md" variant="primary" className="min-h-10" disabled={!destination || drag.pending}>Move</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

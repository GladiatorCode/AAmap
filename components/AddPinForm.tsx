type AddPinFormProps = {
  name: string;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

// Small dialog that asks for a pin name after the user taps the map.
export function AddPinForm({
  name,
  onNameChange,
  onSubmit,
  onCancel,
}: AddPinFormProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-stone-900/30 p-4 sm:items-center"
      onClick={onCancel}
    >
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <h2 className="text-lg font-semibold text-stone-950">Name this pin</h2>
        <p className="mt-1 text-sm font-medium text-stone-700">
          Give this spot a short name so you can find it again.
        </p>

        <label className="mt-4 block text-sm font-semibold text-stone-900" htmlFor="pin-name">
          Pin name
        </label>
        <input
          id="pin-name"
          autoFocus
          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-base outline-none ring-stone-800 focus:ring-2"
          placeholder="Coffee shop"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700"
          >
            Place pin
          </button>
          <button
            type="button"
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

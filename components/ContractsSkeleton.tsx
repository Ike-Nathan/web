export default function ContractsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 space-y-3">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-72 rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="h-10 w-64 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-40 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-40 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="mb-2 h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mb-2 h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mb-4 h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
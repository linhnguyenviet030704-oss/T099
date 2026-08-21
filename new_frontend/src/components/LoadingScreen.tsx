export default function LoadingScreen({ text }: { text: string }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center text-slate-600 dark:text-slate-300">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="mt-4 text-indigo-600 dark:text-indigo-400 font-medium text-sm">{text}</p>
    </div>
  );
}

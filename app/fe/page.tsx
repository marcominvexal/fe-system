"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { engineers } from "@/lib/store";

function av(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function FELoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState(engineers[0].id);

  const handleLogin = () => {
    router.push(`/fe/workspace?engineer=${selected}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/30">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">FE Portal</h1>
        <p className="text-blue-200 text-sm mt-1">Field Engineer Workspace</p>
        <p className="text-blue-300 text-xs mt-0.5">INVEXAL · Orange Business Pakistan</p>
      </div>

      {/* Login card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">Select Your Profile</h2>
        <p className="text-sm text-gray-500 mb-5">Choose your name to access your assigned tasks</p>

        <div className="space-y-2 mb-6">
          {engineers.map((eng) => (
            <button
              key={eng.id}
              onClick={() => setSelected(eng.id)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                selected === eng.id
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                selected === eng.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
              }`}>
                {av(eng.name)}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${selected === eng.id ? "text-blue-700" : "text-gray-800"}`}>
                  {eng.name}
                </p>
                <p className="text-xs text-gray-400">Field Engineer</p>
              </div>
              {selected === eng.id && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={handleLogin}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          Enter Workspace
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Admin? <a href="/admin" className="text-blue-600 font-medium hover:underline">Go to Admin Portal →</a>
        </p>
      </div>
    </div>
  );
}

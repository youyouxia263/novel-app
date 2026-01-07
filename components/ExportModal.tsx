
import React from 'react';
import { X, FileText, FileType } from 'lucide-react';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    onExportText: () => void;
    onExportPDF: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, title, onExportText, onExportPDF }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-800">导出作品 (Export Novel)</h3>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-gray-600" /></button>
                </div>
                
                <p className="text-sm text-gray-600 mb-6">
                    选择导出格式。将导出《{title}》的所有已生成章节。
                </p>

                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={onExportText}
                        className="flex flex-col items-center justify-center p-6 border-2 border-gray-100 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                    >
                        <FileText size={32} className="text-gray-400 group-hover:text-indigo-600 mb-3" />
                        <span className="font-bold text-gray-700 group-hover:text-indigo-700">纯文本 (TXT)</span>
                    </button>

                    <button 
                        onClick={onExportPDF}
                        className="flex flex-col items-center justify-center p-6 border-2 border-gray-100 rounded-xl hover:border-red-500 hover:bg-red-50 transition-all group"
                    >
                        <FileType size={32} className="text-gray-400 group-hover:text-red-600 mb-3" />
                        <span className="font-bold text-gray-700 group-hover:text-red-700">PDF / 打印</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportModal;

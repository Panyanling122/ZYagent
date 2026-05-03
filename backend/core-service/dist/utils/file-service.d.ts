/**
 * =============================================================================
 * 模块名称：文件服务
 * 功能描述：文件上传、存储、路径管理、过期清理。使用path.basename过滤防止目录遍历攻击。
 * 技术决策引用：#23 #88
 * 创建日期：2026-04-30
 * =============================================================================
 */
export declare class FileService {
    private static instance;
    private config;
    private logger;
    private constructor();
    /** 获取单例实例 */
    static getInstance(): FileService;
    /** 保存上传文件到磁盘，返回访问URL和文件大小 */
    saveFile(fileName: string, data: Buffer): Promise<{
        url: string;
        size: number;
    }>;
    /** 获取文件绝对路径（过滤目录遍历字符） */
    getFilePath(fileName: string): string;
    /** 清理超过7天的过期文件 */
    cleanupOldFiles(): Promise<number>;
}
//# sourceMappingURL=file-service.d.ts.map
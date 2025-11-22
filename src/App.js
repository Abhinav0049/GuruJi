import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Toaster } from "./components/ui/sonner";
import { Sidebar } from "./components/Sidebar";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { ModuleSurveyTab } from "./components/ModuleSurveyTab";
import { ModuleAnalysisTab } from "./components/ModuleAnalysisTab";
import { EmployeeExperienceSection } from "./components/EmployeeExperienceSection";
import { ModularSurvey } from "./components/ModularSurvey";
import { PostSurveyDashboard } from "./components/PostSurveyDashboard";
import { SurveyManagement } from "./components/SurveyManagement";
import { WelcomeBanner } from "./components/WelcomeBanner";
import { generateMockData } from "./utils/mockData";
import { parseUrlParams, getSurveyConfig, filterDataBySurvey } from "./utils/surveyManagement";
import { calculateOverallAverages, calculateAIReadinessBySection, calculateLeadershipByLens, calculateLeadershipByConfiguration, calculateLeadershipByDriver, calculateEmployeeExperienceByCategory, calculateEmployeeExperienceByDriver, getEmployeeExperienceDistribution } from "./utils/calculations";
export default function App() {
    // Parse URL parameters for survey filtering
    const urlParams = useMemo(() => parseUrlParams(), []);
    const currentSurvey = useMemo(() => urlParams.surveyId ? getSurveyConfig(urlParams.surveyId) : null, [urlParams.surveyId]);
    // Determine available modules based on URL params or current survey
    const availableModules = useMemo(() => {
        if (currentSurvey) {
            return currentSurvey.modules;
        }
        if (urlParams.modules.length > 0) {
            return urlParams.modules;
        }
        // Admin view - all modules available
        return ['ai-readiness', 'leadership', 'employee-experience'];
    }, [currentSurvey, urlParams.modules]);
    // Check if this is a direct survey link (single module)
    const isDirectSurveyLink = useMemo(() => {
        return availableModules.length === 1 && urlParams.mode === 'survey';
    }, [availableModules, urlParams.mode]);
    // Set initial active module based on primary module or available modules
    const initialModule = useMemo(() => {
        if (urlParams.primaryModule && availableModules.includes(urlParams.primaryModule)) {
            return urlParams.primaryModule;
        }
        if (availableModules.length === 1) {
            return availableModules[0];
        }
        return 'overview';
    }, [urlParams.primaryModule, availableModules]);
    const [activeModule, setActiveModule] = useState(initialModule);
    const [activeSubTab, setActiveSubTab] = useState('survey');
    const [mode, setMode] = useState(urlParams.mode === 'survey' || isDirectSurveyLink ? 'survey' : 'dashboard');
    const [surveyResponses, setSurveyResponses] = useState({});
    const [completedModule, setCompletedModule] = useState('');
    // Generate mock data (stateful so we can refresh it in real-time)
    const [mockData, setMockData] = useState(() => generateMockData(urlParams.surveyId));
    // Re-generate mock data when the survey filter changes
    useEffect(() => {
        setMockData(generateMockData(urlParams.surveyId));
    }, [urlParams.surveyId]);
    // Filter data by survey ID
    const filteredData = useMemo(() => {
        return {
            aiReadinessData: filterDataBySurvey(mockData.aiReadinessData, urlParams.surveyId),
            leadershipData: filterDataBySurvey(mockData.leadershipData, urlParams.surveyId),
            employeeExperienceData: filterDataBySurvey(mockData.employeeExperienceData, urlParams.surveyId)
        };
    }, [mockData, urlParams.surveyId]);
    // Calculate all metrics using filtered data
    const overallAverages = useMemo(() => calculateOverallAverages(filteredData.aiReadinessData, filteredData.leadershipData, filteredData.employeeExperienceData), [filteredData]);
    const aiReadinessBySection = useMemo(() => calculateAIReadinessBySection(filteredData.aiReadinessData), [filteredData.aiReadinessData]);
    const leadershipByLens = useMemo(() => calculateLeadershipByLens(filteredData.leadershipData), [filteredData.leadershipData]);
    const leadershipByConfiguration = useMemo(() => calculateLeadershipByConfiguration(filteredData.leadershipData), [filteredData.leadershipData]);
    const leadershipByDriver = useMemo(() => calculateLeadershipByDriver(filteredData.leadershipData), [filteredData.leadershipData]);
    const employeeByCategory = useMemo(() => calculateEmployeeExperienceByCategory(filteredData.employeeExperienceData), [filteredData.employeeExperienceData]);
    const employeeByDriver = useMemo(() => calculateEmployeeExperienceByDriver(filteredData.employeeExperienceData), [filteredData.employeeExperienceData]);
    const employeeDistribution = useMemo(() => getEmployeeExperienceDistribution(filteredData.employeeExperienceData), [filteredData.employeeExperienceData]);
    // Survey status tracking - updated for correct question counts
    const surveyStatus = useMemo(() => {
        const aiResponses = Object.keys(surveyResponses).filter(key => key.startsWith('ai-')).length;
        const leadershipResponses = Object.keys(surveyResponses).filter(key => key.startsWith('leadership-')).length;
        const eeResponses = Object.keys(surveyResponses).filter(key => key.startsWith('ee-')).length;
        return {
            aiReadiness: aiResponses > 0 ? (aiResponses >= 6 ? 'completed' : 'in-progress') : 'not-started',
            leadership: leadershipResponses > 0 ? (leadershipResponses >= 8 ? 'completed' : 'in-progress') : 'not-started',
            employeeExperience: eeResponses > 0 ? (eeResponses >= 16 ? 'completed' : 'in-progress') : 'not-started'
        };
    }, [surveyResponses]);
    const handleSurveyComplete = (responses) => {
        setSurveyResponses(responses);
        // Determine which module was completed based on response keys and available modules
        const aiResponses = Object.keys(responses).filter(key => key.startsWith('ai-')).length;
        const leadershipResponses = Object.keys(responses).filter(key => key.startsWith('leadership-')).length;
        const eeResponses = Object.keys(responses).filter(key => key.startsWith('ee-')).length;
        let completed = '';
        // Only consider modules that are available in the current survey
        if (aiResponses >= 6 && availableModules.includes('ai-readiness')) {
            completed = 'ai-readiness';
        }
        else if (leadershipResponses >= 8 && availableModules.includes('leadership')) {
            completed = 'leadership';
        }
        else if (eeResponses >= 16 && availableModules.includes('employee-experience')) {
            completed = 'employee-experience';
        }
        if (completed) {
            setCompletedModule(completed);
            setMode('post-survey');
        }
        else {
            setMode('dashboard');
            setActiveModule('overview');
        }
    };
    const handleTakeSurvey = () => {
        setMode('survey');
    };
    const handleBackToDashboard = () => {
        setMode('dashboard');
        setActiveModule('overview');
    };
    // SSE listener: refresh mock data on response events so dashboards update in real-time
    useEffect(() => {
        let es = null;
        try {
            es = new EventSource('/sse');
        }
        catch (err) {
            console.warn('SSE not available', err);
            return;
        }
        const onResponse = (e) => {
            try {
                // regenerate mock data for current survey
                setMockData(generateMockData(urlParams.surveyId));
            }
            catch (err) {
                console.error('Failed to update mockData on SSE', err);
            }
        };
        es.addEventListener('response', onResponse);
        es.onerror = (err) => {
            // EventSource auto-reconnects; log for diagnostics
            console.warn('SSE error', err);
        };
        return () => {
            if (es)
                es.close();
        };
    }, [urlParams.surveyId]);
    const handleModuleChange = (module) => {
        setActiveModule(module);
        if (module !== 'overview') {
            setActiveSubTab('survey');
        }
    };
    // Module configurations - updated with correct question counts
    const moduleConfigs = {
        'ai-readiness': {
            id: 'ai-readiness',
            title: 'AI Readiness Assessment',
            description: 'Evaluate your organization\'s readiness for AI adoption and implementation',
            timeToComplete: '3-5 minutes',
            totalQuestions: 6,
            sections: [
                { name: 'Strategy & Leadership', questions: 2, description: 'Strategic AI vision and leadership commitment' },
                { name: 'Infrastructure & Skills', questions: 2, description: 'Technology infrastructure and team capabilities' },
                { name: 'Data & Culture', questions: 2, description: 'Data governance and organizational culture' }
            ]
        },
        'leadership': {
            id: 'leadership',
            title: 'Leadership Effectiveness',
            description: 'Assess leadership capabilities across multiple dimensions and contexts',
            timeToComplete: '4-6 minutes',
            totalQuestions: 8,
            sections: [
                { name: 'Strategic Vision', questions: 2, description: 'Vision setting and strategic direction' },
                { name: 'Team Development', questions: 2, description: 'People management and growth' },
                { name: 'Communication Excellence', questions: 2, description: 'Communication and listening skills' },
                { name: 'Decision Making', questions: 2, description: 'Decision quality and accountability' }
            ]
        },
        'employee-experience': {
            id: 'employee-experience',
            title: 'Employee Experience',
            description: 'Measure workplace satisfaction and engagement across key experience drivers',
            timeToComplete: '8-10 minutes',
            totalQuestions: 16,
            sections: [
                { name: 'Work Environment', questions: 4, description: 'Physical and cultural workspace' },
                { name: 'Career Growth', questions: 4, description: 'Development and advancement' },
                { name: 'Recognition & Rewards', questions: 4, description: 'Compensation and acknowledgment' },
                { name: 'Work-Life Balance', questions: 4, description: 'Flexibility and wellbeing' }
            ]
        }
    };
    if (mode === 'survey') {
        return (_jsx(ModularSurvey, { onComplete: handleSurveyComplete, specificModule: isDirectSurveyLink ? availableModules[0] : undefined }));
    }
    if (mode === 'post-survey') {
        return (_jsx(PostSurveyDashboard, { completedModule: completedModule, onBackToDashboard: handleBackToDashboard, surveyResponses: surveyResponses, mockData: mockData, isStandalone: isDirectSurveyLink }));
    }
    return (_jsxs(_Fragment, { children: [_jsx(Toaster, {}), _jsxs("div", { className: "min-h-screen bg-gray-50 flex", children: [!(activeModule === 'employee-experience' && mode === 'dashboard') && (_jsx(Sidebar, { activeModule: activeModule, onModuleChange: handleModuleChange, surveyStatus: surveyStatus, isAdmin: urlParams.isAdmin, availableModules: availableModules })), _jsxs("div", { className: "flex-1 overflow-hidden", children: [_jsx("div", { className: "bg-white border-b border-gray-200 px-6 py-4", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900", children: activeModule === 'overview' ?
                                                        (currentSurvey ?
                                                            `${currentSurvey.companyName} - ${currentSurvey.primaryModule === 'ai-readiness' ? 'AI Readiness' :
                                                                currentSurvey.primaryModule === 'leadership' ? 'Leadership' :
                                                                    'Employee Experience'} Overview` :
                                                            'Overview') :
                                                        activeModule === 'ai-readiness' ? 'AI Readiness' :
                                                            activeModule === 'leadership' ? 'Leadership' :
                                                                activeModule === 'employee-experience' ? 'Employee Experience' :
                                                                    activeModule === 'survey-management' ? 'Survey Management' :
                                                                        activeModule.replace('-', ' ') }), _jsx("p", { className: "text-sm text-gray-600 mt-1", children: currentSurvey ?
                                                        `${currentSurvey.targetAudience} • ${currentSurvey.responseCount} responses • ${currentSurvey.status}${currentSurvey.modules.length > 1 ? ` • ${currentSurvey.modules.length} modules` : ''}` :
                                                        activeModule === 'overview' ? 'Dashboard summary and key insights' :
                                                            activeModule === 'ai-readiness' ? 'Technology adoption assessment' :
                                                                activeModule === 'leadership' ? 'Leadership effectiveness analysis' :
                                                                    activeModule === 'employee-experience' ? 'Workplace satisfaction metrics' :
                                                                        activeModule === 'survey-management' ? 'Create and manage client surveys' :
                                                                            activeModule.replace('-', ' ') })] }), _jsxs("div", { className: "flex items-center gap-4", children: [currentSurvey && (_jsx("div", { className: "bg-blue-50 border border-blue-200 rounded-lg px-4 py-2", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-blue-500 rounded-full" }), _jsxs("span", { className: "text-sm font-medium text-blue-800", children: [currentSurvey.companyName, " (", currentSurvey.primaryModule === 'ai-readiness' ? 'AI Readiness' :
                                                                        currentSurvey.primaryModule === 'leadership' ? 'Leadership' :
                                                                            'Employee Experience', ")"] })] }) })), Object.keys(surveyResponses).length > 0 && (_jsx("div", { className: "bg-green-50 border border-green-200 rounded-lg px-4 py-2", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-green-500 rounded-full" }), _jsxs("span", { className: "text-sm font-medium text-green-800", children: ["Survey Completed (", Object.keys(surveyResponses).length, " responses)"] })] }) })), urlParams.isAdmin && !currentSurvey && (_jsx("div", { className: "bg-purple-50 border border-purple-200 rounded-lg px-4 py-2", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 bg-purple-500 rounded-full" }), _jsx("span", { className: "text-sm font-medium text-purple-800", children: "Admin View (All Data)" })] }) }))] })] }) }), _jsxs("div", { className: "p-6 h-full overflow-auto", children: [activeModule === 'overview' && (_jsxs(_Fragment, { children: [_jsx(WelcomeBanner, { currentSurvey: currentSurvey, isAdmin: urlParams.isAdmin, availableModules: availableModules }), _jsx(OverviewDashboard, { overallAverages: overallAverages, surveyResponses: surveyResponses, mockData: filteredData, availableModules: availableModules })] })), activeModule === 'survey-management' && (_jsx(SurveyManagement, {})), availableModules.includes(activeModule) && (_jsx("div", { className: "space-y-6", children: _jsxs(Tabs, { value: activeSubTab, onValueChange: (value) => setActiveSubTab(value), children: [_jsxs(TabsList, { className: "grid w-full grid-cols-2 max-w-md", children: [_jsx(TabsTrigger, { value: "survey", children: "Survey" }), _jsx(TabsTrigger, { value: "analysis", children: "Analysis" })] }), _jsx(TabsContent, { value: "survey", className: "mt-6", children: _jsx(ModuleSurveyTab, { module: moduleConfigs[activeModule], status: activeModule === 'ai-readiness' ? surveyStatus.aiReadiness :
                                                            activeModule === 'leadership' ? surveyStatus.leadership :
                                                                activeModule === 'employee-experience' ? surveyStatus.employeeExperience :
                                                                    'not-started', progress: activeModule === 'ai-readiness' ?
                                                            Math.round((Object.keys(surveyResponses).filter(k => k.startsWith('ai-')).length / 6) * 100) :
                                                            activeModule === 'leadership' ?
                                                                Math.round((Object.keys(surveyResponses).filter(k => k.startsWith('leadership-')).length / 8) * 100) :
                                                                Math.round((Object.keys(surveyResponses).filter(k => k.startsWith('ee-')).length / 16) * 100), onStartSurvey: handleTakeSurvey, onResumeSurvey: handleTakeSurvey, onViewAnalysis: () => setActiveSubTab('analysis'), lastUpdated: Object.keys(surveyResponses).length > 0 ? new Date().toLocaleDateString() : undefined }) }), _jsxs(TabsContent, { value: "analysis", className: "mt-6", children: [activeModule === 'ai-readiness' && availableModules.includes('ai-readiness') && (_jsx(ModuleAnalysisTab, { moduleTitle: "AI Readiness", summaryMetrics: {
                                                                positiveAverage: overallAverages.aiReadiness,
                                                                totalQuestions: 6,
                                                                responseCount: filteredData.aiReadinessData.length,
                                                                trend: 2.3
                                                            }, questionScores: aiReadinessBySection.map(section => ({
                                                                question: section.section,
                                                                score: section.positivePercentage,
                                                                section: 'AI Readiness'
                                                            })), sectionData: aiReadinessBySection.map(section => ({
                                                                section: section.section,
                                                                score: section.positivePercentage,
                                                                questionCount: section.totalCount
                                                            })), surveyResponses: surveyResponses, moduleId: 'ai-readiness' })), activeModule === 'leadership' && availableModules.includes('leadership') && (_jsx(ModuleAnalysisTab, { moduleTitle: "Leadership", summaryMetrics: {
                                                                positiveAverage: overallAverages.leadership,
                                                                totalQuestions: 8,
                                                                responseCount: filteredData.leadershipData.length,
                                                                trend: 1.8
                                                            }, questionScores: leadershipByLens.map(lens => ({
                                                                question: lens.driver,
                                                                score: lens.positivePercentage,
                                                                section: 'Leadership Lens'
                                                            })), sectionData: leadershipByLens.map(lens => ({
                                                                section: lens.driver,
                                                                score: lens.positivePercentage,
                                                                questionCount: lens.totalCount
                                                            })), surveyResponses: surveyResponses, moduleId: 'leadership' })), activeModule === 'employee-experience' && availableModules.includes('employee-experience') && (_jsxs(_Fragment, { children: [_jsx(ModuleAnalysisTab, { moduleTitle: "Employee Experience", summaryMetrics: {
                                                                        positiveAverage: overallAverages.employeeExperience,
                                                                        totalQuestions: 16,
                                                                        responseCount: filteredData.employeeExperienceData.length,
                                                                        trend: -0.5
                                                                    }, questionScores: employeeByCategory.map(category => ({
                                                                        question: category.driver,
                                                                        score: category.positivePercentage,
                                                                        section: 'Employee Experience'
                                                                    })), sectionData: employeeByCategory.map(category => ({
                                                                        section: category.driver,
                                                                        score: category.positivePercentage,
                                                                        questionCount: category.totalCount
                                                                    })), surveyResponses: surveyResponses, moduleId: 'employee-experience' }), _jsx("div", { className: "mt-6", children: _jsx(EmployeeExperienceSection, { categoryData: employeeByCategory, driverData: employeeByDriver, overallPercentage: overallAverages.employeeExperience, distribution: employeeDistribution, surveyResponses: surveyResponses, moduleId: 'employee-experience' }) })] }))] })] }) }))] })] })] })] }));
}

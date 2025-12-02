import React, { useState, useMemo, useEffect } from 'react';
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
// Mock data removed — frontend relies on backend aggregates for real-time data
import { parseUrlParams, getSurveyConfig, filterDataBySurvey } from "./utils/surveyManagement";
import { aiReadinessQuestions, leadershipQuestions, employeeExperienceQuestions } from './utils/surveyData';
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
    // No mock data: start with empty datasets. Frontend will rely on backend `/api/aggregates`.
    const [mockData, setMockData] = useState(() => ({ aiReadinessData: [], leadershipData: [], employeeExperienceData: [] }));
    // Filter data by survey ID
    const filteredData = useMemo(() => {
        return {
            aiReadinessData: filterDataBySurvey(mockData.aiReadinessData || [], urlParams.surveyId),
            leadershipData: filterDataBySurvey(mockData.leadershipData || [], urlParams.surveyId),
            employeeExperienceData: filterDataBySurvey(mockData.employeeExperienceData || [], urlParams.surveyId)
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

    // Backend aggregates state
    const [backendAggregates, setBackendAggregates] = useState(null);

    // If backend aggregates are available, prefer them (aggregated, no PII)
    const usedOverallAverages = useMemo(() => {
        if (!backendAggregates) return overallAverages;
        return {
            aiReadiness: backendAggregates['ai-readiness']?.summaryMetrics?.positiveAverage ?? overallAverages.aiReadiness,
            leadership: backendAggregates['leadership']?.summaryMetrics?.positiveAverage ?? overallAverages.leadership,
            employeeExperience: backendAggregates['employee-experience']?.summaryMetrics?.positiveAverage ?? overallAverages.employeeExperience
        };
    }, [backendAggregates, overallAverages]);

    // Map backend questionScores into the shape components expect, falling back to local calculations
    function mapBackendQuestionScores(moduleKey, questionMetaList, fallbackList) {
        if (!backendAggregates || !backendAggregates[moduleKey] || !backendAggregates[moduleKey].questionScores) return { questionScores: fallbackList, sectionData: [] };
        const scores = backendAggregates[moduleKey].questionScores.map(q => {
            const meta = questionMetaList.find(m => m.id === q.questionId);
            return {
                question: meta ? meta.question : q.questionId,
                score: q.positivePercentage ?? Math.round((q.average || 0) * 10) / 10,
                section: meta ? (meta.section || meta.category || meta.driver || '') : ''
            };
        });
        // derive sectionData
        const bySection = {};
        scores.forEach(s => {
            const sec = s.section || 'Other';
            if (!bySection[sec]) bySection[sec] = { total: 0, count: 0 };
            bySection[sec].total += (s.score || 0);
            bySection[sec].count += 1;
        });
        const sectionData = Object.entries(bySection).map(([section, v]) => ({ section, score: Math.round(((v.total / v.count) + Number.EPSILON) * 10) / 10, questionCount: v.count }));
        return { questionScores: scores, sectionData };
    }

    const aiBackend = mapBackendQuestionScores('ai-readiness', aiReadinessQuestions, aiReadinessBySection.map(section => ({ question: section.section, score: section.positivePercentage, section: 'AI Readiness' })));
    const leadershipBackend = mapBackendQuestionScores('leadership', leadershipQuestions, leadershipByLens.map(lens => ({ question: lens.driver, score: lens.positivePercentage, section: 'Leadership Lens' })));
    const eeBackend = mapBackendQuestionScores('employee-experience', employeeExperienceQuestions, employeeByCategory.map(category => ({ question: category.driver, score: category.positivePercentage, section: 'Employee Experience' })));
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
    // SSE listener: refresh aggregates on response events so dashboards update in real-time
    useEffect(() => {
        let es;
        try {
            es = new EventSource('/sse');
        }
        catch (err) {
            console.warn('SSE not available', err);
            return;
        }
        const onResponse = (e) => {
            try {
                try {
                    const parsed = e.data ? JSON.parse(e.data) : null;
                    console.debug('SSE event received:', e.type, parsed);
                }
                catch (parseErr) {
                    console.debug('SSE event received (no JSON payload)', e.type);
                }
                // Refresh aggregates from backend
                fetchAggregates().catch(err => console.warn('Failed to fetch aggregates on SSE', err));
            }
            catch (err) {
                console.error('Failed to handle SSE event', err);
            }
        };
        es.addEventListener('response', onResponse);
        es.addEventListener('response:created', onResponse);
        es.onerror = (err) => console.warn('SSE error', err);
        return () => es && es.close();
    }, [urlParams.surveyId]);


    async function fetchAggregates() {
        try {
            const qs = urlParams.surveyId ? `?surveyId=${encodeURIComponent(urlParams.surveyId)}` : '';
            const res = await fetch(`/api/aggregates${qs}`);
            if (!res.ok) throw new Error(`Aggregates fetch failed: ${res.status}`);
            const json = await res.json();
            if (json && json.ok && json.aggregates) {
                setBackendAggregates(json.aggregates);
            }
            return json;
        }
        catch (err) {
            console.error('Failed to fetch aggregates', err);
            throw err;
        }
    }

    // Fetch aggregates once on mount / when survey filter changes
    useEffect(() => {
        fetchAggregates().catch(() => { /* already logged */ });
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
        return <ModularSurvey onComplete={handleSurveyComplete} specificModule={isDirectSurveyLink ? availableModules[0] : undefined} />;
    }
    if (mode === 'post-survey') {
        return <PostSurveyDashboard completedModule={completedModule} onBackToDashboard={handleBackToDashboard} surveyResponses={surveyResponses} mockData={mockData} isStandalone={isDirectSurveyLink} backendAggregates={backendAggregates} />;
    }

    return (
        <>
            <Toaster />
            <div className="min-h-screen bg-gray-50 flex">
                {!(activeModule === 'employee-experience' && mode === 'dashboard') && (
                    <Sidebar activeModule={activeModule} onModuleChange={handleModuleChange} surveyStatus={surveyStatus} isAdmin={urlParams.isAdmin} availableModules={availableModules} />
                )}
                <div className="flex-1 overflow-hidden">
                    <div className="bg-white border-b border-gray-200 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">
                                    {activeModule === 'overview' ? (currentSurvey ? `${currentSurvey.companyName} - ${currentSurvey.primaryModule === 'ai-readiness' ? 'AI Readiness' : currentSurvey.primaryModule === 'leadership' ? 'Leadership' : 'Employee Experience'} Overview` : 'Overview') : activeModule.replace('-', ' ')}
                                </h1>
                                <p className="text-sm text-gray-600 mt-1">
                                    {currentSurvey ? `${currentSurvey.targetAudience} • ${currentSurvey.responseCount} responses • ${currentSurvey.status}` : activeModule === 'overview' ? 'Dashboard summary and key insights' : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="p-6 h-full overflow-auto">
                        {!backendAggregates && (
                            <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded">
                                Waiting for backend aggregates — dashboard will update when server data arrives.
                            </div>
                        )}
                        {activeModule === 'overview' && (
                            <>
                                <WelcomeBanner currentSurvey={currentSurvey} isAdmin={urlParams.isAdmin} availableModules={availableModules} />
                                <OverviewDashboard overallAverages={usedOverallAverages} surveyResponses={surveyResponses} mockData={filteredData} availableModules={availableModules} />
                            </>
                        )}

                        {activeModule === 'survey-management' && <SurveyManagement />}

                        {availableModules.includes(activeModule) && (
                            <div className="space-y-6">
                                <Tabs value={activeSubTab} onValueChange={(value) => setActiveSubTab(value)}>
                                    <TabsList className="grid w-full grid-cols-2 max-w-md">
                                        <TabsTrigger value="survey">Survey</TabsTrigger>
                                        <TabsTrigger value="analysis">Analysis</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="survey" className="mt-6">
                                        <ModuleSurveyTab
                                            module={moduleConfigs[activeModule]}
                                            status={activeModule === 'ai-readiness' ? surveyStatus.aiReadiness : activeModule === 'leadership' ? surveyStatus.leadership : activeModule === 'employee-experience' ? surveyStatus.employeeExperience : 'not-started'}
                                            progress={activeModule === 'ai-readiness' ? Math.round((Object.keys(surveyResponses).filter(k => k.startsWith('ai-')).length / 6) * 100) : activeModule === 'leadership' ? Math.round((Object.keys(surveyResponses).filter(k => k.startsWith('leadership-')).length / 8) * 100) : Math.round((Object.keys(surveyResponses).filter(k => k.startsWith('ee-')).length / 16) * 100)}
                                            onStartSurvey={handleTakeSurvey}
                                            onResumeSurvey={handleTakeSurvey}
                                            onViewAnalysis={() => setActiveSubTab('analysis')}
                                            lastUpdated={Object.keys(surveyResponses).length > 0 ? new Date().toLocaleDateString() : undefined}
                                        />
                                    </TabsContent>

                                    <TabsContent value="analysis" className="mt-6">
                                        {activeModule === 'ai-readiness' && (
                                            <ModuleAnalysisTab
                                                moduleTitle="AI Readiness"
                                                summaryMetrics={{
                                                    positiveAverage: usedOverallAverages.aiReadiness,
                                                    totalQuestions: 6,
                                                    responseCount: backendAggregates?.['ai-readiness']?.summaryMetrics?.responseCount ?? filteredData.aiReadinessData.length,
                                                    trend: 2.3
                                                }}
                                                questionScores={aiBackend.questionScores}
                                                sectionData={aiBackend.sectionData}
                                                surveyResponses={surveyResponses}
                                                moduleId="ai-readiness"
                                            />
                                        )}

                                        {activeModule === 'leadership' && (
                                            <ModuleAnalysisTab
                                                moduleTitle="Leadership"
                                                summaryMetrics={{
                                                    positiveAverage: backendAggregates?.leadership?.summaryMetrics?.positiveAverage ?? usedOverallAverages.leadership,
                                                    totalQuestions: backendAggregates?.leadership?.summaryMetrics?.totalQuestions ?? 8,
                                                    responseCount: backendAggregates?.leadership?.summaryMetrics?.responseCount ?? filteredData.leadershipData.length,
                                                    trend: backendAggregates?.leadership?.summaryMetrics?.trend ?? 1.8,
                                                    medianQuestionScore: backendAggregates?.leadership?.summaryMetrics?.medianQuestionScore,
                                                    topDemographic: backendAggregates?.leadership?.summaryMetrics?.topDemographic
                                                }}
                                                questionScores={leadershipBackend.questionScores}
                                                sectionData={leadershipBackend.sectionData}
                                                // Do NOT pass individual survey responses to the UI for company-level analysis
                                                // Only include them for admin users (who explicitly requested it)
                                                surveyResponses={urlParams.isAdmin ? surveyResponses : undefined}
                                                moduleId="leadership"
                                            />
                                        )}

                                        {activeModule === 'employee-experience' && (
                                            <ModuleAnalysisTab
                                                moduleTitle="Employee Experience"
                                                summaryMetrics={{
                                                    positiveAverage: usedOverallAverages.employeeExperience,
                                                    totalQuestions: 16,
                                                    responseCount: backendAggregates?.['employee-experience']?.summaryMetrics?.responseCount ?? filteredData.employeeExperienceData.length,
                                                    trend: 1.8
                                                }}
                                                questionScores={eeBackend.questionScores}
                                                sectionData={eeBackend.sectionData}
                                                surveyResponses={surveyResponses}
                                                moduleId="employee-experience"
                                            />
                                        )}
                                    </TabsContent>
                                </Tabs>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

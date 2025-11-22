import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { TrendingUp, TrendingDown, Users, FileText, Target, Clock, Award, AlertTriangle, CheckCircle2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MyResponsesResults } from './MyResponsesResults';
export function OverviewDashboard({ overallAverages, surveyResponses, mockData, availableModules = ['ai-readiness', 'leadership', 'employee-experience'] }) {
    // Mock trend data for time series
    const trendData = useMemo(() => [
        { month: 'Jan', responses: 45, aiReadiness: 67, leadership: 72, employeeExp: 69 },
        { month: 'Feb', responses: 52, aiReadiness: 71, leadership: 74, employeeExp: 71 },
        { month: 'Mar', responses: 48, aiReadiness: 69, leadership: 76, employeeExp: 68 },
        { month: 'Apr', responses: 61, aiReadiness: 73, leadership: 78, employeeExp: 72 },
        { month: 'May', responses: 58, aiReadiness: 75, leadership: 79, employeeExp: 74 },
        { month: 'Jun', responses: 67, aiReadiness: 78, leadership: 81, employeeExp: 76 }
    ], []);
    // Mock demographic distribution
    const demographicData = useMemo(() => [
        { name: 'Engineering', value: 35, color: '#3B82F6' },
        { name: 'Sales', value: 25, color: '#10B981' },
        { name: 'Marketing', value: 20, color: '#F59E0B' },
        { name: 'Operations', value: 15, color: '#EF4444' },
        { name: 'Other', value: 5, color: '#8B5CF6' }
    ], []);
    const totalParticipants = 250;
    const initialCompletedSurveys = 187;
    const initialActiveRespondents = 98;
    // Live state (updated via SSE)
    const [liveCompletedSurveys, setLiveCompletedSurveys] = useState(initialCompletedSurveys);
    const [liveActiveRespondents, setLiveActiveRespondents] = useState(initialActiveRespondents);
    const [lastEventTime, setLastEventTime] = useState(null);
    const responseRate = Math.round((liveCompletedSurveys / totalParticipants) * 100);
    const overallScore = useMemo(() => {
        const moduleScores = [];
        if (availableModules.includes('ai-readiness'))
            moduleScores.push(overallAverages.aiReadiness);
        if (availableModules.includes('leadership'))
            moduleScores.push(overallAverages.leadership);
        if (availableModules.includes('employee-experience'))
            moduleScores.push(overallAverages.employeeExperience);
        return moduleScores.length > 0 ? Math.round(moduleScores.reduce((sum, score) => sum + score, 0) / moduleScores.length) : 0;
    }, [overallAverages, availableModules]);
    useEffect(() => {
        let es = null;
        try {
            es = new EventSource('/sse');
        }
        catch (err) {
            console.error('EventSource not supported or failed to connect', err);
            return;
        }
        const onConnected = (e) => {
            // connected event - we could parse client id if needed
            // console.log('SSE connected', e.data);
        };
        const onResponse = (e) => {
            try {
                const data = JSON.parse(e.data);
                // data: { surveyId, module, count, timestamp }
                // Increment completed surveys by 1 (a submission), and active respondents by 1
                setLiveCompletedSurveys(prev => prev + 1);
                setLiveActiveRespondents(prev => prev + 1);
                setLastEventTime(new Date(data.timestamp || Date.now()).toLocaleTimeString());
            }
            catch (err) {
                console.error('Malformed SSE response event', err);
            }
        };
        es.addEventListener('connected', onConnected);
        es.addEventListener('response', onResponse);
        es.onerror = (err) => {
            console.warn('SSE error', err);
            // try to reconnect is handled automatically by EventSource
        };
        return () => {
            if (es) {
                es.close();
            }
        };
    }, []);
    // Top performing questions (mock data)
    const topQuestions = [
        { text: "Team collaboration effectiveness", score: 85, module: "Leadership" },
        { text: "Technology training satisfaction", score: 82, module: "AI Readiness" },
        { text: "Work-life balance support", score: 79, module: "Employee Experience" },
        { text: "Innovation encouragement", score: 77, module: "Leadership" }
    ];
    // Questions needing attention (mock data)
    const attentionQuestions = [
        { text: "AI tool adoption readiness", score: 45, module: "AI Readiness" },
        { text: "Change management communication", score: 52, module: "Leadership" },
        { text: "Career development opportunities", score: 58, module: "Employee Experience" }
    ];
    return (_jsx("div", { className: "space-y-6", children: _jsxs(Tabs, { defaultValue: "responses", className: "w-full", children: [_jsxs(TabsList, { className: "grid w-full grid-cols-2", children: [_jsx(TabsTrigger, { value: "responses", children: "My Responses" }), _jsx(TabsTrigger, { value: "results", children: "My Results" })] }), _jsxs(TabsContent, { value: "responses", className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium text-gray-600", children: "Total Participants" }), _jsx(Users, { className: "h-4 w-4 text-blue-600" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: totalParticipants }), _jsx("p", { className: "text-xs text-gray-600 mt-1", children: "Across all modules" })] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium text-gray-600", children: "Surveys Completed" }), _jsx(FileText, { className: "h-4 w-4 text-green-600" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: liveCompletedSurveys }), _jsxs("div", { className: "flex items-center gap-1 mt-1", children: [_jsx(TrendingUp, { className: "h-3 w-3 text-green-600" }), _jsx("p", { className: "text-xs text-green-600", children: "+12% from last month" })] })] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium text-gray-600", children: "Active Respondents" }), _jsx(Clock, { className: "h-4 w-4 text-yellow-600" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: liveActiveRespondents }), _jsx("p", { className: "text-xs text-gray-600 mt-1", children: "Currently taking surveys" })] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium text-gray-600", children: "Response Rate" }), _jsx(Target, { className: "h-4 w-4 text-purple-600" })] }), _jsxs(CardContent, { children: [_jsxs("div", { className: "text-2xl font-bold", children: [responseRate, "%"] }), _jsx("div", { className: "mt-2", children: _jsx(Progress, { value: responseRate, className: "h-1" }) })] })] })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Survey Volume Trend" }), _jsx(CardDescription, { children: "Monthly response activity" })] }), _jsx(CardContent, { children: _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(LineChart, { data: trendData, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "month" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Line, { type: "monotone", dataKey: "responses", stroke: "#3B82F6", strokeWidth: 2, dot: { fill: '#3B82F6' } })] }) }) })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Response Distribution" }), _jsx(CardDescription, { children: "Participation by department" })] }), _jsxs(CardContent, { children: [_jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: demographicData, cx: "50%", cy: "50%", innerRadius: 60, outerRadius: 120, paddingAngle: 5, dataKey: "value", children: demographicData.map((entry, index) => (_jsx(Cell, { fill: entry.color }, `cell-${index}`))) }), _jsx(Tooltip, { formatter: (value) => [`${value}%`, 'Participation'] })] }) }), _jsx("div", { className: "flex flex-wrap gap-2 mt-4 justify-center", children: demographicData.map((item) => (_jsxs(Badge, { variant: "outline", className: "text-xs", children: [_jsx("div", { className: "w-2 h-2 rounded-full mr-1", style: { backgroundColor: item.color } }), item.name] }, item.name))) })] })] })] }), _jsx("div", { className: "mt-6", children: _jsx(MyResponsesResults, { surveyResponses: surveyResponses, module: "all" }) })] }), _jsxs(TabsContent, { value: "results", className: "space-y-6", children: [_jsxs("div", { className: `grid grid-cols-1 gap-4 ${availableModules.length === 1 ? 'md:grid-cols-1' :
                                availableModules.length === 2 ? 'md:grid-cols-2' :
                                    'md:grid-cols-3'}`, children: [availableModules.includes('ai-readiness') && (_jsxs(Card, { className: "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200", children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium text-blue-800", children: "AI Readiness" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(TrendingUp, { className: "h-4 w-4 text-green-600" }), _jsx("span", { className: "text-xs text-green-600", children: "+2.3%" })] })] }), _jsxs(CardContent, { children: [_jsxs("div", { className: "text-3xl font-bold text-blue-900", children: [overallAverages.aiReadiness.toFixed(1), "%"] }), _jsx("p", { className: "text-xs text-blue-700 mt-1", children: "Positive responses (4-5 on 5-point scale)" })] })] })), availableModules.includes('leadership') && (_jsxs(Card, { className: "bg-gradient-to-br from-green-50 to-green-100 border-green-200", children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium text-green-800", children: "Leadership" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(TrendingUp, { className: "h-4 w-4 text-green-600" }), _jsx("span", { className: "text-xs text-green-600", children: "+1.8%" })] })] }), _jsxs(CardContent, { children: [_jsxs("div", { className: "text-3xl font-bold text-green-900", children: [overallAverages.leadership.toFixed(1), "%"] }), _jsx("p", { className: "text-xs text-green-700 mt-1", children: "Positive responses (4-5 on 5-point scale)" })] })] })), availableModules.includes('employee-experience') && (_jsxs(Card, { className: "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200", children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium text-purple-800", children: "Employee Experience" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(TrendingDown, { className: "h-4 w-4 text-red-600" }), _jsx("span", { className: "text-xs text-red-600", children: "-0.5%" })] })] }), _jsxs(CardContent, { children: [_jsxs("div", { className: "text-3xl font-bold text-purple-900", children: [overallAverages.employeeExperience.toFixed(1), "%"] }), _jsx("p", { className: "text-xs text-purple-700 mt-1", children: "Favorable ratings (7-10 on 10-point scale)" })] })] }))] }), _jsxs(Card, { className: "bg-gradient-to-r from-gray-50 to-blue-50 border-blue-200", children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx(CardTitle, { className: "text-xl", children: "Overall LEAP Score" }), _jsxs(CardDescription, { children: ["Combined performance across ", availableModules.length, " module", availableModules.length > 1 ? 's' : '', ": ", availableModules.map(module => module === 'ai-readiness' ? 'AI Readiness' :
                                                                module === 'leadership' ? 'Leadership' :
                                                                    'Employee Experience').join(', ')] })] }), _jsx(Award, { className: "h-8 w-8 text-yellow-600" })] }) }), _jsx(CardContent, { children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "text-4xl font-bold text-gray-900", children: [overallScore, "%"] }), _jsxs("div", { className: "flex-1", children: [_jsx(Progress, { value: overallScore, className: "h-3" }), _jsx("p", { className: "text-sm text-gray-600 mt-1", children: overallScore >= 80 ? 'Excellent performance' :
                                                            overallScore >= 70 ? 'Good performance' :
                                                                overallScore >= 60 ? 'Satisfactory performance' : 'Needs improvement' })] })] }) })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(CheckCircle2, { className: "h-5 w-5 text-green-600" }), "Top Performing Questions"] }), _jsx(CardDescription, { children: "Highest scoring areas across modules" })] }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-3", children: topQuestions.map((question, index) => (_jsxs("div", { className: "flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200", children: [_jsxs("div", { className: "flex-1 pr-2", children: [_jsx("p", { className: "text-sm font-medium text-gray-900", children: question.text }), _jsx("p", { className: "text-xs text-gray-600", children: question.module })] }), _jsx("div", { className: "text-right", children: _jsxs("div", { className: "text-lg font-bold text-green-700", children: [question.score, "%"] }) })] }, index))) }) })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(AlertTriangle, { className: "h-5 w-5 text-yellow-600" }), "Needs Attention"] }), _jsx(CardDescription, { children: "Areas with lower engagement scores" })] }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-3", children: attentionQuestions.map((question, index) => (_jsxs("div", { className: "flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200", children: [_jsxs("div", { className: "flex-1 pr-2", children: [_jsx("p", { className: "text-sm font-medium text-gray-900", children: question.text }), _jsx("p", { className: "text-xs text-gray-600", children: question.module })] }), _jsx("div", { className: "text-right", children: _jsxs("div", { className: "text-lg font-bold text-yellow-700", children: [question.score, "%"] }) })] }, index))) }) })] })] })] })] }) }));
}

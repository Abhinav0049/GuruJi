import { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  FileText, 
  Target,
  BarChart3,
  Clock,
  Award,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MyResponsesResults } from './MyResponsesResults';

interface OverviewDashboardProps {
  overallAverages: {
    aiReadiness: number;
    leadership: number;
    employeeExperience: number;
  };
  surveyResponses: Record<string, string>;
  mockData: any;
  availableModules?: ('ai-readiness' | 'leadership' | 'employee-experience')[];
}

export function OverviewDashboard({ overallAverages, surveyResponses, mockData, availableModules = ['ai-readiness', 'leadership', 'employee-experience'] }: OverviewDashboardProps) {
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
    if (availableModules.includes('ai-readiness')) moduleScores.push(overallAverages.aiReadiness);
    if (availableModules.includes('leadership')) moduleScores.push(overallAverages.leadership);
    if (availableModules.includes('employee-experience')) moduleScores.push(overallAverages.employeeExperience);
    
    return moduleScores.length > 0 ? Math.round(moduleScores.reduce((sum, score) => sum + score, 0) / moduleScores.length) : 0;
  }, [overallAverages, availableModules]);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/sse');
    } catch (err) {
      console.error('EventSource not supported or failed to connect', err);
      return;
    }

    const onConnected = (e: MessageEvent) => {
      // connected event - we could parse client id if needed
      // console.log('SSE connected', e.data);
    };

    const onResponse = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        // data: { surveyId, module, count, timestamp }
        // Increment completed surveys by 1 (a submission), and active respondents by 1
        setLiveCompletedSurveys(prev => prev + 1);
        setLiveActiveRespondents(prev => prev + 1);
        setLastEventTime(new Date(data.timestamp || Date.now()).toLocaleTimeString());
      } catch (err) {
        console.error('Malformed SSE response event', err);
      }
    };

    es.addEventListener('connected', onConnected as EventListener);
    es.addEventListener('response', onResponse as EventListener);
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

  return (
    <div className="space-y-6">
      <Tabs defaultValue="responses" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="responses">My Responses</TabsTrigger>
          <TabsTrigger value="results">My Results</TabsTrigger>
        </TabsList>

        <TabsContent value="responses" className="space-y-6">
          {/* KPI Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Participants</CardTitle>
                <Users className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalParticipants}</div>
                <p className="text-xs text-gray-600 mt-1">Across all modules</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Surveys Completed</CardTitle>
                <FileText className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{liveCompletedSurveys}</div>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <p className="text-xs text-green-600">+12% from last month</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Active Respondents</CardTitle>
                <Clock className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{liveActiveRespondents}</div>
                <p className="text-xs text-gray-600 mt-1">Currently taking surveys</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Response Rate</CardTitle>
                <Target className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{responseRate}%</div>
                <div className="mt-2">
                  <Progress value={responseRate} className="h-1" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Survey Volume Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Survey Volume Trend</CardTitle>
                <CardDescription>Monthly response activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="responses" 
                        stroke="#3B82F6" 
                        strokeWidth={2}
                        dot={{ fill: '#3B82F6' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Response Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Response Distribution</CardTitle>
                <CardDescription>Participation by department</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={demographicData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={120}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {demographicData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value}%`, 'Participation']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {demographicData.map((item) => (
                    <Badge key={item.name} variant="outline" className="text-xs">
                      <div 
                        className="w-2 h-2 rounded-full mr-1" 
                        style={{ backgroundColor: item.color }}
                      />
                      {item.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Personal Responses (per-question + module averages) */}
          <div className="mt-6">
            <MyResponsesResults surveyResponses={surveyResponses} module="all" />
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          {/* Live Module Scores - filtered by available modules */}
          <div className={`grid grid-cols-1 gap-4 ${
            availableModules.length === 1 ? 'md:grid-cols-1' :
            availableModules.length === 2 ? 'md:grid-cols-2' :
            'md:grid-cols-3'
          }`}>
            {availableModules.includes('ai-readiness') && (
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-blue-800">AI Readiness</CardTitle>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-xs text-green-600">+2.3%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-900">
                    {overallAverages.aiReadiness.toFixed(1)}%
                  </div>
                  <p className="text-xs text-blue-700 mt-1">Positive responses (4-5 on 5-point scale)</p>
                </CardContent>
              </Card>
            )}

            {availableModules.includes('leadership') && (
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-green-800">Leadership</CardTitle>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-xs text-green-600">+1.8%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-900">
                    {overallAverages.leadership.toFixed(1)}%
                  </div>
                  <p className="text-xs text-green-700 mt-1">Positive responses (4-5 on 5-point scale)</p>
                </CardContent>
              </Card>
            )}

            {availableModules.includes('employee-experience') && (
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-purple-800">Employee Experience</CardTitle>
                  <div className="flex items-center gap-1">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <span className="text-xs text-red-600">-0.5%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-900">
                    {overallAverages.employeeExperience.toFixed(1)}%
                  </div>
                  <p className="text-xs text-purple-700 mt-1">Favorable ratings (7-10 on 10-point scale)</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Overall LEAP Score */}
          <Card className="bg-gradient-to-r from-gray-50 to-blue-50 border-blue-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Overall LEAP Score</CardTitle>
                  <CardDescription>
                    Combined performance across {availableModules.length} module{availableModules.length > 1 ? 's' : ''}: {
                      availableModules.map(module => 
                        module === 'ai-readiness' ? 'AI Readiness' :
                        module === 'leadership' ? 'Leadership' :
                        'Employee Experience'
                      ).join(', ')
                    }
                  </CardDescription>
                </div>
                <Award className="h-8 w-8 text-yellow-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold text-gray-900">{overallScore}%</div>
                <div className="flex-1">
                  <Progress value={overallScore} className="h-3" />
                  <p className="text-sm text-gray-600 mt-1">
                    {overallScore >= 80 ? 'Excellent performance' : 
                     overallScore >= 70 ? 'Good performance' : 
                     overallScore >= 60 ? 'Satisfactory performance' : 'Needs improvement'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Question Performance Review */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Performing Questions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Top Performing Questions
                </CardTitle>
                <CardDescription>Highest scoring areas across modules</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topQuestions.map((question, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex-1 pr-2">
                        <p className="text-sm font-medium text-gray-900">{question.text}</p>
                        <p className="text-xs text-gray-600">{question.module}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-700">{question.score}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Questions Needing Attention */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  Needs Attention
                </CardTitle>
                <CardDescription>Areas with lower engagement scores</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {attentionQuestions.map((question, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="flex-1 pr-2">
                        <p className="text-sm font-medium text-gray-900">{question.text}</p>
                        <p className="text-xs text-gray-600">{question.module}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-yellow-700">{question.score}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}